package azure

import (
	"crypto/tls"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Azure/go-ntlmssp"
)

func parseWindowsUser(username string) (domain, user string) {
	value := strings.TrimSpace(username)
	if i := strings.Index(value, `\`); i >= 0 {
		return value[:i], value[i+1:]
	}
	return "", value
}

func newHTTPClient(insecureTLS bool, ntlm bool) *http.Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: insecureTLS}, //nolint:gosec // corporate on-prem certs
		Proxy:           http.ProxyFromEnvironment,
	}
	var rt http.RoundTripper = transport
	if ntlm {
		rt = ntlmssp.Negotiator{RoundTripper: transport}
	}
	return &http.Client{
		Timeout:   60 * time.Second,
		Transport: rt,
	}
}

func doRequest(client *http.Client, method, url, username, secret string, ntlm bool, headers map[string]string, body io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if ntlm {
		// go-ntlmssp upgrades Basic → NTLM handshake (same idea as frontend httpntlm).
		domain, user := parseWindowsUser(username)
		if domain != "" {
			req.SetBasicAuth(domain+`\`+user, secret)
		} else {
			req.SetBasicAuth(user, secret)
		}
	} else {
		// PAT: Basic {user}:{pat} — user may be empty / collection / username.
		user := username
		if user == "" {
			user = "VssSessionToken"
		}
		req.SetBasicAuth(user, secret)
	}
	return client.Do(req)
}
