package main

import (
	"encoding/json"
	"fmt"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
)

const kvPendingPrefix = "ado_pending_"

// pendingSetup is in-progress connection wizard state (login done, picking collection/project/team).
type pendingSetup struct {
	Conn         azure.Connection `json:"conn"`
	PendingType  string           `json:"pendingType,omitempty"`
	PendingTitle string           `json:"pendingTitle,omitempty"`
	ChannelID    string           `json:"channelId,omitempty"`
	RootID       string           `json:"rootId,omitempty"`
	Step         string           `json:"step,omitempty"` // collection | project | team
}

func (p *Plugin) pendingKey(userID string) string {
	return kvPendingPrefix + userID
}

func (p *Plugin) getPending(userID string) (*pendingSetup, error) {
	data, appErr := p.API.KVGet(p.pendingKey(userID))
	if appErr != nil {
		return nil, appErr
	}
	if len(data) == 0 {
		return nil, nil
	}
	var pending pendingSetup
	if err := json.Unmarshal(data, &pending); err != nil {
		return nil, err
	}
	if pending.Conn.Secret != "" {
		plain, err := p.decrypt(pending.Conn.Secret)
		if err != nil {
			return nil, fmt.Errorf("не удалось расшифровать пароль: %w", err)
		}
		pending.Conn.Secret = plain
	}
	return &pending, nil
}

func (p *Plugin) savePending(userID string, pending *pendingSetup) error {
	clone := *pending
	if clone.Conn.Secret != "" {
		enc, err := p.encrypt(clone.Conn.Secret)
		if err != nil {
			return err
		}
		clone.Conn.Secret = enc
	}
	data, err := json.Marshal(clone)
	if err != nil {
		return err
	}
	if appErr := p.API.KVSet(p.pendingKey(userID), data); appErr != nil {
		return appErr
	}
	return nil
}

func (p *Plugin) deletePending(userID string) error {
	if appErr := p.API.KVDelete(p.pendingKey(userID)); appErr != nil {
		return appErr
	}
	return nil
}
