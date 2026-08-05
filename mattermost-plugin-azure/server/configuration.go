package main

import (
	"reflect"

	"github.com/pkg/errors"
)

type configuration struct {
	DefaultServerURL  string
	DefaultCollection string
	DefaultProject    string
	DefaultTeam       string
	APIVersion        string
	InsecureTLS       bool
	EncryptionKey     string
	WorkItemBaseURL   string
}

func (c *configuration) Clone() *configuration {
	var clone configuration
	clone = *c
	return &clone
}

func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	if p.configuration == nil {
		return &configuration{}
	}
	return p.configuration
}

func (p *Plugin) setConfiguration(cfg *configuration) {
	p.configurationLock.Lock()
	defer p.configurationLock.Unlock()
	if cfg != nil && p.configuration != nil && reflect.DeepEqual(cfg, p.configuration) {
		return
	}
	p.configuration = cfg
}

func (p *Plugin) OnConfigurationChange() error {
	cfg := new(configuration)
	if err := p.API.LoadPluginConfiguration(cfg); err != nil {
		return errors.Wrap(err, "failed to load plugin configuration")
	}
	if cfg.APIVersion == "" {
		cfg.APIVersion = "7.0"
	}
	if cfg.DefaultCollection == "" {
		cfg.DefaultCollection = "DefaultCollection"
	}
	p.setConfiguration(cfg)
	return nil
}
