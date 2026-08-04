package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

func toSelectOptions(items []azure.PathOption, limit int) []*model.PostActionOptions {
	if limit <= 0 {
		limit = 100
	}
	out := make([]*model.PostActionOptions, 0, len(items)+1)
	out = append(out, &model.PostActionOptions{Text: "— не указано —", Value: ""})
	for i, item := range items {
		if i >= limit {
			break
		}
		label := item.Name
		if label == "" {
			label = item.Path
		}
		out = append(out, &model.PostActionOptions{Text: label, Value: item.Path})
	}
	return out
}

func (p *Plugin) openCreateDialog(args *model.CommandArgs, conn *azure.Connection, workItemType, titleHint string) error {
	client := azure.NewClient(*conn)

	areaOpts := []*model.PostActionOptions{{Text: "— не указано —", Value: ""}}
	iterOpts := []*model.PostActionOptions{{Text: "— не выбрано —", Value: ""}}
	if areas, err := client.ListAreas(); err == nil {
		areaOpts = toSelectOptions(areas, 80)
	}
	if iters, err := client.ListIterations(); err == nil {
		iterOpts = toSelectOptions(iters, 80)
	}

	bodyLabel := "Описание"
	bodyHelp := "Текст описания (как System.Description)"
	if strings.EqualFold(workItemType, "Bug") {
		bodyLabel = "Шаги воспроизведения"
		bodyHelp = "Repro Steps (Microsoft.VSTS.TCM.ReproSteps)"
	}

	state, _ := json.Marshal(map[string]string{
		"type":      workItemType,
		"userId":    args.UserId,
		"channelId": args.ChannelId,
		"rootId":    args.RootId,
	})

	elements := []model.DialogElement{
		{
			DisplayName: "Название",
			Name:        "title",
			Type:        "text",
			Default:     titleHint,
			Placeholder: "Что нужно сделать?",
			Optional:    false,
		},
		{
			DisplayName: "Area",
			Name:        "areaPath",
			Type:        "select",
			Options:     areaOpts,
			Optional:    true,
		},
		{
			DisplayName: "Итерация",
			Name:        "iterationPath",
			Type:        "select",
			Options:     iterOpts,
			Optional:    true,
		},
		{
			DisplayName: "Исполнитель",
			Name:        "assignedTo",
			Type:        "text",
			Placeholder: `DOMAIN\user или email`,
			HelpText:    "Как в Azure Fast Board: уникальное имя / DOMAIN\\user. Пусто = не назначен.",
			Optional:    true,
		},
		{
			DisplayName: "Тэги",
			Name:        "tags",
			Type:        "text",
			Placeholder: "urgent; ui",
			HelpText:    "Через точку с запятой",
			Optional:    true,
		},
		{
			DisplayName: bodyLabel,
			Name:        "body",
			Type:        "textarea",
			HelpText:    bodyHelp,
			Optional:    true,
		},
	}

	dialog := model.OpenDialogRequest{
		TriggerId: args.TriggerId,
		URL:       p.pluginURL("/dialog/create"),
		Dialog: model.Dialog{
			Title:            fmt.Sprintf("Создать %s", workItemType),
			IntroductionText: fmt.Sprintf("Проект `%s` · %s", conn.Project, conn.ServerURL),
			SubmitLabel:      "Создать",
			CallbackId:       "ado_create",
			State:            string(state),
			Elements:         elements,
		},
	}
	if appErr := p.API.OpenInteractiveDialog(dialog); appErr != nil {
		return appErr
	}
	return nil
}

func (p *Plugin) handleCreateDialog(w http.ResponseWriter, r *http.Request) {
	var req model.SubmitDialogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var state map[string]string
	_ = json.Unmarshal([]byte(req.State), &state)
	workItemType := state["type"]
	if workItemType == "" {
		workItemType = "Bug"
	}

	title := strings.TrimSpace(fmt.Sprint(req.Submission["title"]))
	if title == "" {
		p.writeDialogError(w, "Укажите название", map[string]string{"title": "Обязательное поле"})
		return
	}

	userID := req.UserId
	if userID == "" {
		userID = state["userId"]
	}
	conn, err := p.getConnection(userID)
	if err != nil || conn == nil {
		p.writeDialogError(w, "Нет сохранённого подключения. Выполните `/ado login`.", nil)
		return
	}

	body := strings.TrimSpace(fmt.Sprint(req.Submission["body"]))
	// Mattermost textarea is plain text — wrap paragraphs loosely as HTML for ADO rich fields.
	bodyHTML := ""
	if body != "" {
		escaped := strings.ReplaceAll(body, "&", "&amp;")
		escaped = strings.ReplaceAll(escaped, "<", "&lt;")
		escaped = strings.ReplaceAll(escaped, ">", "&gt;")
		parts := strings.Split(escaped, "\n")
		var b strings.Builder
		for _, line := range parts {
			b.WriteString("<div>")
			if strings.TrimSpace(line) == "" {
				b.WriteString("<br/>")
			} else {
				b.WriteString(line)
			}
			b.WriteString("</div>")
		}
		bodyHTML = b.String()
	}

	tagsRaw := strings.TrimSpace(fmt.Sprint(req.Submission["tags"]))
	var tags []string
	if tagsRaw != "" {
		for _, part := range strings.Split(tagsRaw, ";") {
			part = strings.TrimSpace(part)
			if part != "" {
				tags = append(tags, part)
			}
		}
	}

	input := azure.CreateWorkItemInput{
		Type:          workItemType,
		Title:         title,
		AssignedTo:    strings.TrimSpace(fmt.Sprint(req.Submission["assignedTo"])),
		AreaPath:      strings.TrimSpace(fmt.Sprint(req.Submission["areaPath"])),
		IterationPath: strings.TrimSpace(fmt.Sprint(req.Submission["iterationPath"])),
		Tags:          tags,
	}
	if strings.EqualFold(workItemType, "Bug") {
		input.ReproSteps = bodyHTML
	} else {
		input.Description = bodyHTML
	}

	client := azure.NewClient(*conn)
	wi, err := client.CreateWorkItem(input)
	if err != nil {
		p.writeDialogError(w, "Не удалось создать work item: "+err.Error(), nil)
		return
	}

	channelID := req.ChannelId
	if channelID == "" {
		channelID = state["channelId"]
	}
	link := wi.URL
	if cfg := p.getConfiguration(); strings.TrimSpace(cfg.WorkItemBaseURL) != "" {
		link = strings.TrimRight(cfg.WorkItemBaseURL, "/") + fmt.Sprintf("/%d", wi.ID)
	}

	msg := fmt.Sprintf("✅ Создан **%s #%d**: [%s](%s)", wi.Type, wi.ID, wi.Title, link)
	p.API.SendEphemeralPost(userID, &model.Post{
		ChannelId: channelID,
		RootId:    state["rootId"],
		Message:   msg,
	})

	_ = json.NewEncoder(w).Encode(&model.SubmitDialogResponse{})
}
