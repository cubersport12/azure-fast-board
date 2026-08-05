package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

type namedOption struct {
	Name string `json:"name"`
	ID   string `json:"id,omitempty"`
}

func toNamedOptions(items []azure.NamedEntity) []namedOption {
	out := make([]namedOption, 0, len(items))
	for _, item := range items {
		name := item.Name
		if name == "" {
			name = item.ID
		}
		if name == "" {
			continue
		}
		out = append(out, namedOption{Name: name, ID: item.ID})
	}
	return out
}

func (p *Plugin) openLoginModal(args *model.CommandArgs, pendingType, pendingTitle string) {
	p.API.PublishWebSocketEvent("open_login_modal", map[string]any{
		"pendingType":  pendingType,
		"pendingTitle": pendingTitle,
		"channelId":    args.ChannelId,
		"rootId":       args.RootId,
	}, &model.WebsocketBroadcast{UserId: args.UserId})
}

func (p *Plugin) handleAPILoginDefaults(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	cfg := p.getConfiguration()
	serverURL := strings.TrimSpace(cfg.DefaultServerURL)
	username := ""
	insecure := cfg.InsecureTLS
	if existing, _ := p.getConnection(userID); existing != nil {
		if existing.ServerURL != "" {
			serverURL = existing.ServerURL
		}
		username = existing.Username
		insecure = existing.InsecureTLS || insecure
	}
	p.writeJSON(w, http.StatusOK, map[string]any{
		"serverUrl":   serverURL,
		"username":    username,
		"insecureTls": insecure,
	})
}

func (p *Plugin) handleAPILogin(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	var body struct {
		ServerURL    string `json:"serverUrl"`
		Username     string `json:"username"`
		Password     string `json:"password"`
		InsecureTLS  bool   `json:"insecureTls"`
		PendingType  string `json:"pendingType"`
		PendingTitle string `json:"pendingTitle"`
		ChannelID    string `json:"channelId"`
		RootID       string `json:"rootId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	serverURL := strings.TrimSpace(body.ServerURL)
	username := strings.TrimSpace(body.Username)
	password := body.Password
	if serverURL == "" || username == "" || strings.TrimSpace(password) == "" {
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Укажите URL, логин и пароль"})
		return
	}

	cfg := p.getConfiguration()
	apiVersion := cfg.APIVersion
	if apiVersion == "" {
		apiVersion = "7.0"
	}
	insecure := body.InsecureTLS || cfg.InsecureTLS

	conn := azure.Connection{
		ServerURL:   strings.TrimRight(serverURL, "/"),
		APIVersion:  apiVersion,
		Username:    username,
		AuthMethod:  azure.AuthPassword,
		InsecureTLS: insecure,
		Secret:      password,
	}
	client := azure.NewClient(conn)
	collections, err := client.ListCollections()
	if err != nil {
		p.writeJSON(w, http.StatusBadGateway, map[string]string{
			"error": "Не удалось войти: " + azure.FormatConnectError(err),
		})
		return
	}
	conn = client.Conn()

	collection := strings.TrimSpace(cfg.DefaultCollection)
	if collection == "" && len(collections) > 0 {
		collection = collections[0].Name
	}
	conn.Collection = collection
	conn.Project = strings.TrimSpace(cfg.DefaultProject)
	conn.Team = strings.TrimSpace(cfg.DefaultTeam)

	pending := &pendingSetup{
		Conn:         conn,
		PendingType:  strings.TrimSpace(body.PendingType),
		PendingTitle: strings.TrimSpace(body.PendingTitle),
		ChannelID:    strings.TrimSpace(body.ChannelID),
		RootID:       strings.TrimSpace(body.RootID),
		Step:         "setup",
	}
	if err := p.savePending(userID, pending); err != nil {
		p.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	projects, teams := p.loadSetupLists(&pending.Conn)
	_ = p.savePending(userID, pending)

	p.writeJSON(w, http.StatusOK, map[string]any{
		"collections": toNamedOptions(collections),
		"projects":    toNamedOptions(projects),
		"teams":       toNamedOptions(teams),
		"collection":  pending.Conn.Collection,
		"project":     pending.Conn.Project,
		"team":        pending.Conn.Team,
		"serverUrl":   pending.Conn.ServerURL,
	})
}

func (p *Plugin) handleAPISetupMeta(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Сессия входа истекла. Войдите снова."})
		return
	}
	if v := strings.TrimSpace(r.URL.Query().Get("collection")); v != "" {
		pending.Conn.Collection = v
	}
	if v := strings.TrimSpace(r.URL.Query().Get("project")); v != "" {
		pending.Conn.Project = v
	}
	projects, teams := p.loadSetupLists(&pending.Conn)
	_ = p.savePending(userID, pending)
	p.writeJSON(w, http.StatusOK, map[string]any{
		"projects":   toNamedOptions(projects),
		"teams":      toNamedOptions(teams),
		"collection": pending.Conn.Collection,
		"project":    pending.Conn.Project,
		"team":       pending.Conn.Team,
	})
}

func (p *Plugin) handleAPISetup(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Сессия входа истекла. Войдите снова."})
		return
	}
	var body struct {
		Collection string `json:"collection"`
		Project    string `json:"project"`
		Team       string `json:"team"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	collection := strings.TrimSpace(body.Collection)
	project := strings.TrimSpace(body.Project)
	team := strings.TrimSpace(body.Team)
	if collection == "" || project == "" || team == "" {
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Выберите коллекцию, проект и команду"})
		return
	}
	pending.Conn.Collection = collection
	pending.Conn.Project = project
	pending.Conn.Team = team
	pending.Conn.AuthMethod = azure.AuthPassword

	if err := p.saveConnection(userID, &pending.Conn); err != nil {
		p.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	_ = p.deletePending(userID)

	channelID := pending.ChannelID
	msg := "✅ Подключение сохранено: `" + collection + "` / `" + project + "` / `" + team + "`"
	if channelID != "" {
		p.API.SendEphemeralPost(userID, &model.Post{ChannelId: channelID, Message: msg})
	}

	p.writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"collection":   collection,
		"project":      project,
		"team":         team,
		"pendingType":  pending.PendingType,
		"pendingTitle": pending.PendingTitle,
		"channelId":    pending.ChannelID,
		"rootId":       pending.RootID,
	})
}

func (p *Plugin) loadSetupLists(conn *azure.Connection) (projects, teams []azure.NamedEntity) {
	client := azure.NewClient(*conn)
	if strings.TrimSpace(conn.Collection) == "" {
		return nil, nil
	}
	projects, _ = client.ListProjects()
	*conn = client.Conn()
	if len(projects) > 0 {
		if conn.Project == "" {
			conn.Project = projects[0].Name
		} else {
			found := false
			for _, pr := range projects {
				if pr.Name == conn.Project || pr.ID == conn.Project {
					found = true
					break
				}
			}
			if !found {
				conn.Project = projects[0].Name
			}
		}
	}
	if conn.Project == "" {
		return projects, nil
	}
	client = azure.NewClient(*conn)
	teams, _ = client.ListTeams()
	*conn = client.Conn()
	if len(teams) > 0 {
		if conn.Team == "" {
			conn.Team = teams[0].Name
		} else {
			found := false
			for _, t := range teams {
				if t.Name == conn.Team || t.ID == conn.Team {
					found = true
					break
				}
			}
			if !found {
				conn.Team = teams[0].Name
			}
		}
	} else if conn.Team == "" {
		conn.Team = conn.Project
	}
	return projects, teams
}
