package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

// buildSetupForm returns one dialog with collection + project + team (dependent via refresh).
func (p *Plugin) buildSetupForm(userID string, pending *pendingSetup) (*model.Dialog, error) {
	client := azure.NewClient(pending.Conn)
	collections, err := client.ListCollections()
	if err != nil {
		return nil, err
	}
	pending.Conn = client.Conn()

	colOpts := namedOptions(collections, 100)
	if len(colOpts) == 0 {
		return nil, fmt.Errorf("коллекции не найдены")
	}
	collection := firstOption(colOpts, pending.Conn.Collection)
	pending.Conn.Collection = collection

	client = azure.NewClient(pending.Conn)
	projects, err := client.ListProjects()
	if err != nil {
		return nil, err
	}
	pending.Conn = client.Conn()
	projOpts := namedOptions(projects, 100)
	if len(projOpts) == 0 {
		projOpts = []*model.PostActionOptions{{Text: "— нет проектов —", Value: ""}}
	}
	project := firstOption(projOpts, pending.Conn.Project)
	pending.Conn.Project = project

	var teamOpts []*model.PostActionOptions
	if project != "" {
		client = azure.NewClient(pending.Conn)
		if teams, err := client.ListTeams(); err == nil {
			pending.Conn = client.Conn()
			teamOpts = namedOptions(teams, 100)
		}
	}
	if len(teamOpts) == 0 {
		fallback := project
		if fallback == "" {
			fallback = "default"
		}
		teamOpts = []*model.PostActionOptions{{Text: fallback + " Team", Value: fallback}}
	}
	team := firstOption(teamOpts, pending.Conn.Team)
	pending.Conn.Team = team
	_ = p.savePending(userID, pending)

	state, _ := json.Marshal(map[string]string{
		"step":         "setup",
		"userId":       userID,
		"channelId":    pending.ChannelID,
		"rootId":       pending.RootID,
		"pendingType":  pending.PendingType,
		"pendingTitle": pending.PendingTitle,
	})

	return &model.Dialog{
		Title:       "Настройка Azure DevOps",
		SubmitLabel: "Сохранить",
		CallbackId:  "ado_setup",
		State:       string(state),
		SourceURL:   p.pluginPath("/dialog/auth"),
		Elements: []model.DialogElement{
			{
				DisplayName: "Коллекция",
				Name:        "collection",
				Type:        "select",
				Options:     colOpts,
				Default:     collection,
				Refresh:     true,
				Optional:    false,
			},
			{
				DisplayName: "Проект",
				Name:        "project",
				Type:        "select",
				Options:     projOpts,
				Default:     project,
				Refresh:     true,
				Optional:    false,
			},
			{
				DisplayName: "Команда",
				Name:        "team",
				Type:        "select",
				Options:     teamOpts,
				Default:     team,
				Optional:    false,
			},
		},
	}, nil
}

func isDialogRefresh(req *model.SubmitDialogRequest) bool {
	if strings.EqualFold(strings.TrimSpace(req.Type), "refresh") {
		return true
	}
	// Apps Form adapter may omit type and only send selected_field.
	if req.Submission != nil {
		if _, ok := req.Submission["selected_field"]; ok {
			return true
		}
	}
	return false
}

func (p *Plugin) writeFormResponse(w http.ResponseWriter, form *model.Dialog) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{
		Type: string(model.SubmitDialogResponseTypeForm),
		Form: form,
	})
}

func (p *Plugin) handleSetupDialog(w http.ResponseWriter, req *model.SubmitDialogRequest, state map[string]string) {
	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	pending, err := p.getPending(userID)
	if err != nil || pending == nil {
		p.writeDialogError(w, "Сессия входа истекла. `/ado login`", nil)
		return
	}

	collection := submissionString(req.Submission["collection"])
	project := submissionString(req.Submission["project"])
	team := submissionString(req.Submission["team"])

	if collection != "" {
		pending.Conn.Collection = collection
	}
	if project != "" {
		pending.Conn.Project = project
	}
	if team != "" {
		pending.Conn.Team = team
	}

	// Refresh MUST return type:"form". Empty/ok breaks the Apps Form modal.
	if isDialogRefresh(req) {
		selected := submissionString(req.Submission["selected_field"])
		if selected == "collection" {
			pending.Conn.Project = ""
			pending.Conn.Team = ""
		}
		if selected == "project" {
			pending.Conn.Team = ""
		}
		_ = p.savePending(userID, pending)
		form, err := p.buildSetupForm(userID, pending)
		if err != nil {
			p.API.LogError("ado setup refresh failed", "error", err.Error())
			p.writeDialogError(w, err.Error(), nil)
			return
		}
		p.writeFormResponse(w, form)
		return
	}

	errors := map[string]string{}
	if pending.Conn.Collection == "" {
		errors["collection"] = "Обязательно"
	}
	if pending.Conn.Project == "" {
		errors["project"] = "Обязательно"
	}
	if pending.Conn.Team == "" {
		errors["team"] = "Обязательно"
	}
	if len(errors) > 0 {
		p.writeDialogError(w, "Заполните все поля", errors)
		return
	}

	pending.Conn.AuthMethod = azure.AuthPassword
	if err := p.saveConnection(userID, &pending.Conn); err != nil {
		p.writeDialogError(w, "Не удалось сохранить: "+err.Error(), nil)
		return
	}
	_ = p.deletePending(userID)

	channelID := req.ChannelId
	if channelID == "" {
		channelID = pending.ChannelID
	}
	msg := fmt.Sprintf(
		"✅ `%s` / `%s` / `%s`",
		pending.Conn.Collection, pending.Conn.Project, pending.Conn.Team,
	)
	if pending.PendingType != "" {
		hint := ""
		if t := strings.TrimSpace(pending.PendingTitle); t != "" {
			hint = " " + t
		}
		msg += fmt.Sprintf("\n`/%s%s`", strings.ToLower(pending.PendingType), hint)
	}
	p.API.SendEphemeralPost(userID, &model.Post{ChannelId: channelID, Message: msg})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{
		Type: string(model.SubmitDialogResponseTypeOK),
	})
}

// Fallback for older Mattermost clients that ignore type:"form" after auth.
func (p *Plugin) handleInteractiveSetup(w http.ResponseWriter, r *http.Request) {
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
	form, err := p.buildSetupForm(userID, pending)
	if err != nil {
		p.replyActionError(w, err.Error())
		return
	}
	dialog := model.OpenDialogRequest{
		TriggerId: req.TriggerId,
		URL:       p.pluginPath("/dialog/auth"),
		Dialog:    *form,
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		p.replyActionError(w, appErr.Error())
		return
	}
	p.writeEmptyOK(w)
}

func submissionString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(t)
	case map[string]any:
		if value := strings.TrimSpace(fmt.Sprint(t["value"])); value != "" && value != "<nil>" {
			return value
		}
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
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
