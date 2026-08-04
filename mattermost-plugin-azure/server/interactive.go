package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

func (p *Plugin) handleInteractiveCollection(w http.ResponseWriter, r *http.Request) {
	var req model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	userID := req.UserId
	if v, ok := req.Context["user_id"].(string); ok && v != "" {
		userID = v
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.replyActionError(w, "Сессия входа истекла. Выполните `/ado login` ещё раз.")
		return
	}

	client := azure.NewClient(pending.Conn)
	collections, err := client.ListCollections()
	if err != nil {
		p.replyActionError(w, "Не удалось загрузить коллекции: "+err.Error())
		return
	}
	pending.Conn = client.Conn()
	_ = p.savePending(userID, pending)

	opts := namedOptions(collections, 100)
	if len(opts) == 0 {
		p.replyActionError(w, "Коллекции не найдены")
		return
	}

	state, _ := json.Marshal(map[string]string{"userId": userID, "step": "collection"})
	dialog := model.OpenDialogRequest{
		TriggerId: req.TriggerId,
		URL:       p.pluginURL("/dialog/collection"),
		Dialog: model.Dialog{
			Title:            "Коллекция Azure DevOps",
			IntroductionText: "Выберите коллекцию (как в Azure Fast Board).",
			SubmitLabel:      "Далее",
			CallbackId:       "ado_collection",
			State:            string(state),
			Elements: []model.DialogElement{{
				DisplayName: "Коллекция",
				Name:        "collection",
				Type:        "select",
				Options:     opts,
				Default:     firstOption(opts, pending.Conn.Collection),
				Optional:    false,
			}},
		},
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		p.replyActionError(w, appErr.Error())
		return
	}
	p.writeEmptyOK(w)
}

func (p *Plugin) handleCollectionDialog(w http.ResponseWriter, r *http.Request) {
	var req model.SubmitDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		p.writeEmptyOK(w)
		return
	}
	var state map[string]string
	_ = json.Unmarshal([]byte(req.State), &state)
	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeDialogError(w, "Сессия входа истекла. `/ado login`", nil)
		return
	}
	collection := strings.TrimSpace(fmt.Sprint(req.Submission["collection"]))
	if collection == "" {
		p.writeDialogError(w, "Выберите коллекцию", map[string]string{"collection": "Обязательно"})
		return
	}
	pending.Conn.Collection = collection
	pending.Conn.Project = ""
	pending.Conn.Team = ""
	pending.Step = "project"
	if err := p.savePending(userID, pending); err != nil {
		p.writeDialogError(w, err.Error(), nil)
		return
	}

	channelID := req.ChannelId
	if channelID == "" {
		channelID = pending.ChannelID
	}
	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: channelID,
		Message:   fmt.Sprintf("Коллекция **%s**. Выберите проект:", collection),
		Props: model.StringInterface{
			"attachments": []*model.SlackAttachment{{
				Actions: []*model.PostAction{{
					Id:   "ado_pick_project",
					Name: "Выбрать проект",
					Type: model.PostActionTypeButton,
					Integration: &model.PostActionIntegration{
						URL:     fmt.Sprintf("/plugins/%s/interactive/project", manifest.Id),
						Context: map[string]any{"user_id": userID},
					},
				}},
			}},
		},
	})
	p.writeEmptyOK(w)
}

func (p *Plugin) handleInteractiveProject(w http.ResponseWriter, r *http.Request) {
	var req model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	userID := req.UserId
	if v, ok := req.Context["user_id"].(string); ok && v != "" {
		userID = v
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil || pending.Conn.Collection == "" {
		p.replyActionError(w, "Сначала выберите коллекцию (`/ado login`).")
		return
	}
	client := azure.NewClient(pending.Conn)
	projects, err := client.ListProjects()
	if err != nil {
		p.replyActionError(w, "Не удалось загрузить проекты: "+err.Error())
		return
	}
	pending.Conn = client.Conn()
	_ = p.savePending(userID, pending)
	opts := namedOptions(projects, 100)
	if len(opts) == 0 {
		p.replyActionError(w, "Проекты не найдены")
		return
	}
	state, _ := json.Marshal(map[string]string{"userId": userID, "step": "project"})
	dialog := model.OpenDialogRequest{
		TriggerId: req.TriggerId,
		URL:       p.pluginURL("/dialog/project"),
		Dialog: model.Dialog{
			Title:            "Проект Azure DevOps",
			IntroductionText: fmt.Sprintf("Коллекция `%s`", pending.Conn.Collection),
			SubmitLabel:      "Далее",
			CallbackId:       "ado_project",
			State:            string(state),
			Elements: []model.DialogElement{{
				DisplayName: "Проект",
				Name:        "project",
				Type:        "select",
				Options:     opts,
				Default:     firstOption(opts, pending.Conn.Project),
				Optional:    false,
			}},
		},
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		p.replyActionError(w, appErr.Error())
		return
	}
	p.writeEmptyOK(w)
}

func (p *Plugin) handleProjectDialog(w http.ResponseWriter, r *http.Request) {
	var req model.SubmitDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		p.writeEmptyOK(w)
		return
	}
	var state map[string]string
	_ = json.Unmarshal([]byte(req.State), &state)
	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeDialogError(w, "Сессия входа истекла. `/ado login`", nil)
		return
	}
	project := strings.TrimSpace(fmt.Sprint(req.Submission["project"]))
	if project == "" {
		p.writeDialogError(w, "Выберите проект", map[string]string{"project": "Обязательно"})
		return
	}
	pending.Conn.Project = project
	pending.Conn.Team = ""
	pending.Step = "team"
	if err := p.savePending(userID, pending); err != nil {
		p.writeDialogError(w, err.Error(), nil)
		return
	}
	channelID := req.ChannelId
	if channelID == "" {
		channelID = pending.ChannelID
	}
	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: channelID,
		Message:   fmt.Sprintf("Проект **%s**. Выберите команду:", project),
		Props: model.StringInterface{
			"attachments": []*model.SlackAttachment{{
				Actions: []*model.PostAction{{
					Id:   "ado_pick_team",
					Name: "Выбрать команду",
					Type: model.PostActionTypeButton,
					Integration: &model.PostActionIntegration{
						URL:     fmt.Sprintf("/plugins/%s/interactive/team", manifest.Id),
						Context: map[string]any{"user_id": userID},
					},
				}},
			}},
		},
	})
	p.writeEmptyOK(w)
}

func (p *Plugin) handleInteractiveTeam(w http.ResponseWriter, r *http.Request) {
	var req model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	userID := req.UserId
	if v, ok := req.Context["user_id"].(string); ok && v != "" {
		userID = v
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil || pending.Conn.Project == "" {
		p.replyActionError(w, "Сначала выберите проект.")
		return
	}
	client := azure.NewClient(pending.Conn)
	teams, err := client.ListTeams()
	if err != nil {
		p.replyActionError(w, "Не удалось загрузить команды: "+err.Error())
		return
	}
	pending.Conn = client.Conn()
	_ = p.savePending(userID, pending)

	opts := namedOptions(teams, 100)
	if len(opts) == 0 {
		// Allow finishing without a team (some projects have a default team only).
		opts = []*model.PostActionOptions{{Text: pending.Conn.Project + " Team", Value: pending.Conn.Project}}
	}
	state, _ := json.Marshal(map[string]string{"userId": userID, "step": "team"})
	dialog := model.OpenDialogRequest{
		TriggerId: req.TriggerId,
		URL:       p.pluginURL("/dialog/team"),
		Dialog: model.Dialog{
			Title:            "Команда Azure DevOps",
			IntroductionText: fmt.Sprintf("`%s` / `%s`", pending.Conn.Collection, pending.Conn.Project),
			SubmitLabel:      "Сохранить подключение",
			CallbackId:       "ado_team",
			State:            string(state),
			Elements: []model.DialogElement{{
				DisplayName: "Команда",
				Name:        "team",
				Type:        "select",
				Options:     opts,
				Default:     firstOption(opts, pending.Conn.Team),
				Optional:    false,
			}},
		},
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		p.replyActionError(w, appErr.Error())
		return
	}
	p.writeEmptyOK(w)
}

func (p *Plugin) handleTeamDialog(w http.ResponseWriter, r *http.Request) {
	var req model.SubmitDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		p.writeEmptyOK(w)
		return
	}
	var state map[string]string
	_ = json.Unmarshal([]byte(req.State), &state)
	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeDialogError(w, "Сессия входа истекла. `/ado login`", nil)
		return
	}
	team := strings.TrimSpace(fmt.Sprint(req.Submission["team"]))
	if team == "" {
		p.writeDialogError(w, "Выберите команду", map[string]string{"team": "Обязательно"})
		return
	}
	pending.Conn.Team = team
	pending.Conn.AuthMethod = azure.AuthPassword

	if err := p.saveConnection(userID, &pending.Conn); err != nil {
		p.writeDialogError(w, "Не удалось сохранить подключение: "+err.Error(), nil)
		return
	}
	_ = p.deletePending(userID)

	channelID := req.ChannelId
	if channelID == "" {
		channelID = pending.ChannelID
	}
	msg := fmt.Sprintf(
		"✅ Подключение сохранено:\n• `%s`\n• коллекция `%s`\n• проект `%s`\n• команда `%s`\n\nМожно создавать: `/bug` и `/task`.",
		pending.Conn.ServerURL, pending.Conn.Collection, pending.Conn.Project, pending.Conn.Team,
	)
	if pending.PendingType != "" {
		hint := ""
		if t := strings.TrimSpace(pending.PendingTitle); t != "" {
			hint = " " + t
		}
		msg += fmt.Sprintf("\n\nОткройте форму: `/%s%s`", strings.ToLower(pending.PendingType), hint)
	}
	p.API.SendEphemeralPost(userID, &model.Post{ChannelId: channelID, Message: msg})
	p.writeEmptyOK(w)
}

func firstOption(opts []*model.PostActionOptions, preferred string) string {
	if preferred != "" {
		for _, opt := range opts {
			if strings.EqualFold(opt.Value, preferred) {
				return opt.Value
			}
		}
	}
	if len(opts) > 0 {
		return opts[0].Value
	}
	return ""
}

func (p *Plugin) writeEmptyOK(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{}`))
}

func (p *Plugin) replyActionError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(model.PostActionIntegrationResponse{
		EphemeralText: message,
	})
}
