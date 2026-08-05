package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/cubersport12/azure-fast-board/mattermost-plugin-azure/server/azure"
	"github.com/mattermost/mattermost/server/public/model"
)

func (p *Plugin) requireUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "unauthorized: нет Mattermost-User-Id (проверьте CSRF / сессию)",
		})
		return "", false
	}
	return userID, true
}

func (p *Plugin) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func (p *Plugin) handleAPIStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	conn, err := p.getConnection(userID)
	if err != nil {
		p.writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if conn == nil || strings.TrimSpace(conn.Secret) == "" || strings.TrimSpace(conn.Project) == "" {
		p.writeJSON(w, http.StatusOK, map[string]any{"connected": false})
		return
	}
	p.writeJSON(w, http.StatusOK, map[string]any{
		"connected":  true,
		"serverUrl":  conn.ServerURL,
		"collection": conn.Collection,
		"project":    conn.Project,
		"team":       conn.Team,
		"username":   conn.Username,
	})
}

func (p *Plugin) handleAPIMeta(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	conn, err := p.getConnection(userID)
	if err != nil || conn == nil {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not connected"})
		return
	}
	client := azure.NewClient(*conn)
	areas, _ := client.ListAreas()
	iters, _ := client.ListIterations()
	people, _ := client.ListAssignees()

	areaOut := make([]map[string]string, 0, len(areas))
	for _, a := range areas {
		areaOut = append(areaOut, map[string]string{"path": a.Path, "name": a.Name})
	}
	iterOut := make([]map[string]string, 0, len(iters))
	for _, it := range iters {
		iterOut = append(iterOut, map[string]string{"path": it.Path, "name": it.Name})
	}
	peopleOut := make([]map[string]string, 0, len(people))
	for _, id := range people {
		peopleOut = append(peopleOut, map[string]string{
			"displayName": id.DisplayName,
			"uniqueName":  id.UniqueName,
		})
	}
	p.writeJSON(w, http.StatusOK, map[string]any{
		"areas":      areaOut,
		"iterations": iterOut,
		"assignees":  peopleOut,
	})
}

func (p *Plugin) handleAPIAssignees(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	conn, err := p.getConnection(userID)
	if err != nil || conn == nil {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not connected"})
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	client := azure.NewClient(*conn)
	people, err := client.SearchAssignees(q)
	if err != nil {
		people, _ = client.ListAssignees()
	}
	out := make([]map[string]string, 0, len(people))
	for i, id := range people {
		if i >= 50 {
			break
		}
		out = append(out, map[string]string{
			"displayName": id.DisplayName,
			"uniqueName":  id.UniqueName,
		})
	}
	p.writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (p *Plugin) handleAPICreateWorkItem(w http.ResponseWriter, r *http.Request) {
	userID, ok := p.requireUserID(w, r)
	if !ok {
		return
	}
	conn, err := p.getConnection(userID)
	if err != nil || conn == nil {
		p.writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "not connected"})
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		// Also accept application/x-www-form-urlencoded / JSON-less multipart failures.
		if err2 := r.ParseForm(); err2 != nil {
			p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid form: " + err.Error()})
			return
		}
	}

	workItemType := strings.TrimSpace(r.FormValue("type"))
	if workItemType == "" {
		workItemType = "Bug"
	}
	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		p.writeJSON(w, http.StatusBadRequest, map[string]string{"error": "title required"})
		return
	}
	body := strings.TrimSpace(r.FormValue("body"))
	areaPath := strings.TrimSpace(r.FormValue("areaPath"))
	iterationPath := strings.TrimSpace(r.FormValue("iterationPath"))
	assignedTo := strings.TrimSpace(r.FormValue("assignedTo"))
	tagsRaw := strings.TrimSpace(r.FormValue("tags"))
	channelID := strings.TrimSpace(r.FormValue("channelId"))
	rootID := strings.TrimSpace(r.FormValue("rootId"))

	var tags []string
	if tagsRaw != "" {
		for _, part := range strings.Split(tagsRaw, ";") {
			part = strings.TrimSpace(part)
			if part != "" {
				tags = append(tags, part)
			}
		}
	}

	var blobSrcs []string
	if raw := strings.TrimSpace(r.FormValue("blobSrcs")); raw != "" {
		_ = json.Unmarshal([]byte(raw), &blobSrcs)
	}

	// Create without blob: placeholders; embed real ADO attachment URLs after upload.
	createHTML := plainOrHTMLToADO(stripBlobImages(body))
	input := azure.CreateWorkItemInput{
		Type:          workItemType,
		Title:         title,
		AssignedTo:    assignedTo,
		AreaPath:      areaPath,
		IterationPath: iterationPath,
		Tags:          tags,
	}
	if strings.EqualFold(workItemType, "Bug") {
		input.ReproSteps = createHTML
	} else {
		input.Description = createHTML
	}

	client := azure.NewClient(*conn)
	wi, err := client.CreateWorkItem(input)
	if err != nil {
		p.writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}

	finalHTML := body
	var inlineOK, inlineFail int
	if r.MultipartForm != nil {
		files := r.MultipartForm.File["files"]
		for i, fh := range files {
			f, err := fh.Open()
			if err != nil {
				inlineFail++
				continue
			}
			data, err := io.ReadAll(f)
			_ = f.Close()
			if err != nil || len(data) == 0 {
				inlineFail++
				continue
			}
			name := fh.Filename
			if name == "" {
				name = "screenshot.png"
			}
			name = filepath.Base(name)
			attURL, err := client.UploadAttachment(wi.ID, name, data)
			if err != nil {
				p.API.LogError("ado upload attachment failed", "error", err.Error())
				inlineFail++
				continue
			}
			inlineOK++
			if i < len(blobSrcs) && blobSrcs[i] != "" {
				finalHTML = strings.ReplaceAll(finalHTML, blobSrcs[i], attURL)
			}
		}
	}
	finalHTML = stripBlobImages(finalHTML)
	finalHTML = plainOrHTMLToADO(finalHTML)

	bodyField := azure.FieldDescription
	if strings.EqualFold(workItemType, "Bug") {
		bodyField = azure.FieldReproSteps
	}
	if inlineOK > 0 && strings.TrimSpace(finalHTML) != "" && finalHTML != createHTML {
		if err := client.UpdateWorkItemField(wi.ID, bodyField, finalHTML); err != nil {
			p.API.LogError("ado update body with inline images failed", "error", err.Error())
			inlineFail++
		}
	}

	link := wi.URL
	if cfg := p.getConfiguration(); strings.TrimSpace(cfg.WorkItemBaseURL) != "" {
		link = strings.TrimRight(cfg.WorkItemBaseURL, "/") + fmt.Sprintf("/%d", wi.ID)
	}

	msg := fmt.Sprintf("✅ Создан **%s #%d**: [%s](%s)", wi.Type, wi.ID, wi.Title, link)
	if inlineOK > 0 {
		msg += fmt.Sprintf("\n🖼 Скриншотов в описании: %d", inlineOK)
	}
	if inlineFail > 0 {
		msg += fmt.Sprintf("\n⚠️ Не удалось встроить: %d", inlineFail)
	}
	if channelID != "" {
		p.API.SendEphemeralPost(userID, &model.Post{
			ChannelId: channelID,
			RootId:    rootID,
			Message:   msg,
		})
	}

	p.writeJSON(w, http.StatusOK, map[string]any{
		"id":           wi.ID,
		"url":          link,
		"title":        wi.Title,
		"type":         wi.Type,
		"attachments":  inlineOK,
		"attachErrors": inlineFail,
	})
}

// stripBlobImages removes temporary TipTap blob: images before/after ADO URL rewrite.
func stripBlobImages(html string) string {
	const imgOpen = "<img"
	var b strings.Builder
	rest := html
	for {
		i := strings.Index(strings.ToLower(rest), imgOpen)
		if i < 0 {
			b.WriteString(rest)
			break
		}
		b.WriteString(rest[:i])
		rest = rest[i:]
		end := strings.Index(rest, ">")
		if end < 0 {
			b.WriteString(rest)
			break
		}
		tag := rest[:end+1]
		rest = rest[end+1:]
		low := strings.ToLower(tag)
		if strings.Contains(low, `src="blob:`) || strings.Contains(low, `src='blob:`) {
			continue
		}
		b.WriteString(tag)
	}
	return b.String()
}

func plainOrHTMLToADO(body string) string {
	body = strings.TrimSpace(body)
	if body == "" {
		return ""
	}
	if strings.Contains(body, "<") && strings.Contains(body, ">") {
		return body
	}
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
	return b.String()
}

func (p *Plugin) openCreateModal(args *model.CommandArgs, workItemType, titleHint string) {
	p.API.PublishWebSocketEvent("open_create_modal", map[string]any{
		"type":      workItemType,
		"titleHint": titleHint,
		"channelId": args.ChannelId,
		"rootId":    args.RootId,
	}, &model.WebsocketBroadcast{UserId: args.UserId})
}
