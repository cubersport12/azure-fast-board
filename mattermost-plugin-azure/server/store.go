package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
)

const (
	kvPrefix         = "ado_conn_"
	kvInstallKey     = "ado_enc_install_key"
	legacyDefaultKey = "azure-fast-board-mattermost-plugin-default-key"
)

func (p *Plugin) connKey(userID string) string {
	return kvPrefix + userID
}

func (p *Plugin) getConnection(userID string) (*azure.Connection, error) {
	data, appErr := p.API.KVGet(p.connKey(userID))
	if appErr != nil {
		return nil, appErr
	}
	if len(data) == 0 {
		return nil, nil
	}
	var conn azure.Connection
	if err := json.Unmarshal(data, &conn); err != nil {
		return nil, err
	}
	if conn.Secret != "" {
		plain, err := p.decrypt(conn.Secret)
		if err != nil {
			return nil, fmt.Errorf("не удалось расшифровать сохранённый пароль: %w", err)
		}
		conn.Secret = plain
	}
	return &conn, nil
}

func (p *Plugin) saveConnection(userID string, conn *azure.Connection) error {
	clone := *conn
	if clone.Secret != "" {
		enc, err := p.encrypt(clone.Secret)
		if err != nil {
			return err
		}
		clone.Secret = enc
	}
	data, err := json.Marshal(clone)
	if err != nil {
		return err
	}
	if appErr := p.API.KVSet(p.connKey(userID), data); appErr != nil {
		return appErr
	}
	return nil
}

func (p *Plugin) deleteConnection(userID string) error {
	if appErr := p.API.KVDelete(p.connKey(userID)); appErr != nil {
		return appErr
	}
	return nil
}

func sha256Key(raw string) []byte {
	sum := sha256.Sum256([]byte(raw))
	out := make([]byte, len(sum))
	copy(out, sum[:])
	return out
}

// getOrCreateInstallKey returns a random per-install key stored in plugin KV
// (used when admin did not set EncryptionKey).
func (p *Plugin) getOrCreateInstallKey() string {
	data, appErr := p.API.KVGet(kvInstallKey)
	if appErr == nil && len(data) > 0 {
		return string(data)
	}
	buf := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		return legacyDefaultKey
	}
	key := base64.StdEncoding.EncodeToString(buf)
	_ = p.API.KVSet(kvInstallKey, []byte(key))
	return key
}

func (p *Plugin) primaryEncryptionKey() []byte {
	if raw := strings.TrimSpace(p.getConfiguration().EncryptionKey); raw != "" {
		return sha256Key(raw)
	}
	return sha256Key(p.getOrCreateInstallKey())
}

func (p *Plugin) decryptionKeys() [][]byte {
	seen := map[string]bool{}
	var keys [][]byte
	add := func(raw string) {
		if strings.TrimSpace(raw) == "" {
			return
		}
		k := sha256Key(raw)
		id := base64.StdEncoding.EncodeToString(k)
		if seen[id] {
			return
		}
		seen[id] = true
		keys = append(keys, k)
	}
	if raw := strings.TrimSpace(p.getConfiguration().EncryptionKey); raw != "" {
		add(raw)
	}
	add(p.getOrCreateInstallKey())
	add(legacyDefaultKey) // migrate secrets encrypted before per-install keys
	return keys
}

func (p *Plugin) encrypt(plain string) (string, error) {
	block, err := aes.NewCipher(p.primaryEncryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

func (p *Plugin) decrypt(encoded string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		// Legacy plaintext fallback (should not happen for new saves).
		return encoded, nil
	}
	var lastErr error
	for _, key := range p.decryptionKeys() {
		block, err := aes.NewCipher(key)
		if err != nil {
			lastErr = err
			continue
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			lastErr = err
			continue
		}
		if len(raw) < gcm.NonceSize() {
			continue
		}
		nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
		plain, err := gcm.Open(nil, nonce, ciphertext, nil)
		if err != nil {
			lastErr = err
			continue
		}
		return string(plain), nil
	}
	if lastErr != nil {
		return "", lastErr
	}
	return "", fmt.Errorf("decrypt failed")
}
