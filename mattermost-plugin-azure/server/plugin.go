package main

import (
	"net/http"
	"strings"
	"sync"

	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"
)

type Plugin struct {
	plugin.MattermostPlugin

	client *pluginapi.Client

	configurationLock sync.RWMutex
	configuration     *configuration
}

func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)
	if err := p.OnConfigurationChange(); err != nil {
		return err
	}
	if strings.TrimSpace(p.getConfiguration().EncryptionKey) == "" {
		// Passwords live only in Mattermost plugin KV (AES-GCM), never leave to third parties.
		// Without EncryptionKey we use a random per-install key in KV — set EncryptionKey in prod.
		p.API.LogWarn("EncryptionKey is empty; using per-install key in plugin KV. Set EncryptionKey in plugin settings for production.")
		_ = p.getOrCreateInstallKey()
	}
	return p.registerCommands()
}

func (p *Plugin) OnDeactivate() error {
	_ = p.API.UnregisterCommand("", "bug")
	_ = p.API.UnregisterCommand("", "task")
	_ = p.API.UnregisterCommand("", "ado")
	return nil
}

func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	switch {
	case path == "/dialog/auth":
		p.handleAuthDialog(w, r)
	case path == "/interactive/setup":
		p.handleInteractiveSetup(w, r)
	case path == "/api/v1/status" && r.Method == http.MethodGet:
		p.handleAPIStatus(w, r)
	case path == "/api/v1/meta" && r.Method == http.MethodGet:
		p.handleAPIMeta(w, r)
	case path == "/api/v1/assignees" && r.Method == http.MethodGet:
		p.handleAPIAssignees(w, r)
	case path == "/api/v1/workitems" && r.Method == http.MethodPost:
		p.handleAPICreateWorkItem(w, r)
	case strings.HasPrefix(path, "/api/v1/"):
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	default:
		http.NotFound(w, r)
	}
}
