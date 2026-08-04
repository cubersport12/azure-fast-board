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

const kvPrefix = "ado_conn_"

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

func (p *Plugin) encryptionKeyBytes() []byte {
	cfg := p.getConfiguration()
	raw := strings.TrimSpace(cfg.EncryptionKey)
	if raw == "" {
		// Deterministic fallback so plugin works out of the box; admins should set a real key.
		raw = "azure-fast-board-mattermost-plugin-default-key"
	}
	sum := sha256.Sum256([]byte(raw))
	return sum[:]
}

func (p *Plugin) encrypt(plain string) (string, error) {
	block, err := aes.NewCipher(p.encryptionKeyBytes())
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
		// Legacy / plaintext fallback
		return encoded, nil
	}
	block, err := aes.NewCipher(p.encryptionKeyBytes())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return encoded, nil
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
