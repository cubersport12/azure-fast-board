package main

import (
	"net/http"
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
	return p.registerCommands()
}

func (p *Plugin) OnDeactivate() error {
	_ = p.API.UnregisterCommand("", "bug")
	_ = p.API.UnregisterCommand("", "task")
	_ = p.API.UnregisterCommand("", "ado")
	return nil
}

func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/dialog/auth":
		p.handleAuthDialog(w, r)
	case "/dialog/collection":
		p.handleCollectionDialog(w, r)
	case "/dialog/project":
		p.handleProjectDialog(w, r)
	case "/dialog/team":
		p.handleTeamDialog(w, r)
	case "/dialog/create":
		p.handleCreateDialog(w, r)
	case "/interactive/collection":
		p.handleInteractiveCollection(w, r)
	case "/interactive/project":
		p.handleInteractiveProject(w, r)
	case "/interactive/team":
		p.handleInteractiveTeam(w, r)
	default:
		http.NotFound(w, r)
	}
}
