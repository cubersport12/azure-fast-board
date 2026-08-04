package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

func (p *Plugin) pluginURL(path string) string {
	siteURL := ""
	if cfg := p.API.GetConfig(); cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		siteURL = strings.TrimRight(*cfg.ServiceSettings.SiteURL, "/")
	}
	return fmt.Sprintf("%s/plugins/%s%s", siteURL, manifest.Id, path)
}

func (p *Plugin) openAuthDialog(args *model.CommandArgs, pendingType, pendingTitle string) error {
	cfg := p.getConfiguration()
	existing, _ := p.getConnection(args.UserId)

	serverURL := cfg.DefaultServerURL
	username := ""
	insecure := cfg.InsecureTLS
	if existing != nil {
		serverURL = existing.ServerURL
		username = existing.Username
		insecure = existing.InsecureTLS
	}

	state, _ := json.Marshal(map[string]string{
		"pendingType":  pendingType,
		"pendingTitle": pendingTitle,
		"userId":       args.UserId,
		"channelId":    args.ChannelId,
		"rootId":       args.RootId,
	})

	dialog := model.OpenDialogRequest{
		TriggerId: args.TriggerId,
		URL:       p.pluginURL("/dialog/auth"),
		Dialog: model.Dialog{
			Title:            "Вход в Azure DevOps Server",
			IntroductionText: "Как в Azure Fast Board: сначала **логин/пароль (NTLM)**, формат `DOMAIN\\user`. После входа выберете коллекцию, проект и команду из списков.",
			SubmitLabel:      "Войти",
			CallbackId:       "ado_auth",
			State:            string(state),
			Elements: []model.DialogElement{
				{
					DisplayName: "URL сервера",
					Name:        "serverUrl",
					Type:        "text",
					Placeholder: "https://devops.company.local/tfs",
					Default:     serverURL,
					Optional:    false,
				},
				{
					DisplayName: "Логин (DOMAIN\\user)",
					Name:        "username",
					Type:        "text",
					Default:     username,
					Placeholder: `CORP\ivanov`,
					Optional:    false,
				},
				{
					DisplayName: "Пароль",
					Name:        "password",
					Type:        "text",
					SubType:     "password",
					Optional:    false,
				},
				{
					DisplayName: "Небезопасный TLS (корпоративный сертификат)",
					Name:        "insecureTls",
					Type:        "bool",
					Default:     fmt.Sprintf("%t", insecure),
					Optional:    true,
				},
			},
		},
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		return appErr
	}
	return nil
}

func (p *Plugin) handleAuthDialog(w http.ResponseWriter, r *http.Request) {
	var req model.SubmitDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if req.Cancelled {
		_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{})
		return
	}

	var state map[string]string
	_ = json.Unmarshal([]byte(req.State), &state)

	serverURL := strings.TrimSpace(fmt.Sprint(req.Submission["serverUrl"]))
	username := strings.TrimSpace(fmt.Sprint(req.Submission["username"]))
	password := fmt.Sprint(req.Submission["password"])
	insecure := false
	switch v := req.Submission["insecureTls"].(type) {
	case bool:
		insecure = v
	case string:
		insecure = strings.EqualFold(v, "true")
	}

	errors := map[string]string{}
	if serverURL == "" {
		errors["serverUrl"] = "Укажите URL"
	}
	if username == "" {
		errors["username"] = "Укажите логин"
	}
	if strings.TrimSpace(password) == "" {
		errors["password"] = "Укажите пароль"
	}
	if len(errors) > 0 {
		p.writeDialogError(w, "Проверьте поля", errors)
		return
	}

	cfg := p.getConfiguration()
	apiVersion := cfg.APIVersion
	if apiVersion == "" {
		apiVersion = "7.0"
	}
	if cfg.InsecureTLS {
		insecure = true
	}

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
		p.writeDialogError(w, "Не удалось войти: "+azure.FormatConnectError(err), map[string]string{
			"serverUrl": "Хост должен резолвиться с сервера Mattermost",
		})
		return
	}
	// Persist discovered server root (/tfs) back into pending conn.
	conn = client.Conn()

	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	channelID := req.ChannelId
	if channelID == "" {
		channelID = state["channelId"]
	}

	pending := &pendingSetup{
		Conn:         conn,
		PendingType:  state["pendingType"],
		PendingTitle: state["pendingTitle"],
		ChannelID:    channelID,
		RootID:       state["rootId"],
		Step:         "collection",
	}
	if err := p.savePending(userID, pending); err != nil {
		p.writeDialogError(w, "Вход выполнен, но не удалось сохранить сессию: "+err.Error(), nil)
		return
	}

	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: channelID,
		Message: fmt.Sprintf(
			"✅ Вход в Azure DevOps выполнен (%d коллекций). Нажмите кнопку, чтобы выбрать **коллекцию → проект → команду**.",
			len(collections),
		),
		Props: model.StringInterface{
			"attachments": []*model.SlackAttachment{{
				Actions: []*model.PostAction{{
					Id:   "ado_pick_collection",
					Name: "Выбрать коллекцию",
					Type: model.PostActionTypeButton,
					Integration: &model.PostActionIntegration{
						URL: fmt.Sprintf("/plugins/%s/interactive/collection", manifest.Id),
						Context: map[string]any{
							"user_id": userID,
						},
					},
				}},
			}},
		},
	})

	_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{})
}

func (p *Plugin) writeDialogError(w http.ResponseWriter, message string, errors map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{
		Error:  message,
		Errors: errors,
	})
}

func namedOptions(items []azure.NamedEntity, limit int) []*model.PostActionOptions {
	if limit <= 0 {
		limit = 100
	}
	out := make([]*model.PostActionOptions, 0, len(items))
	for i, item := range items {
		if i >= limit {
			break
		}
		label := item.Name
		if label == "" {
			label = item.ID
		}
		value := item.Name
		if value == "" {
			value = item.ID
		}
		out = append(out, &model.PostActionOptions{Text: label, Value: value})
	}
	return out
}
