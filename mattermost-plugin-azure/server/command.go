package main

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

func (p *Plugin) registerCommands() error {
	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "bug",
		AutoComplete:     true,
		AutoCompleteDesc: "Создать Bug в Azure DevOps",
		AutoCompleteHint: "[название]",
		DisplayName:      "Azure Bug",
		Description:      "Открывает форму создания Bug (как в Azure Fast Board)",
	}); err != nil {
		return err
	}
	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          "task",
		AutoComplete:     true,
		AutoCompleteDesc: "Создать Task в Azure DevOps",
		AutoCompleteHint: "[название]",
		DisplayName:      "Azure Task",
		Description:      "Открывает форму создания Task (как в Azure Fast Board)",
	}); err != nil {
		return err
	}
	return p.API.RegisterCommand(&model.Command{
		Trigger:          "ado",
		AutoComplete:     true,
		AutoCompleteDesc: "Управление подключением к Azure DevOps",
		AutoCompleteHint: "[login|logout|status|help]",
		DisplayName:      "Azure DevOps",
		Description:      "login / logout / status для учётки Azure DevOps Server",
	})
}

func (p *Plugin) ExecuteCommand(_ *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	fields := strings.Fields(args.Command)
	if len(fields) == 0 {
		return p.ephemeral("Пустая команда"), nil
	}
	trigger := strings.TrimPrefix(strings.ToLower(fields[0]), "/")
	rest := strings.TrimSpace(strings.TrimPrefix(args.Command, fields[0]))

	switch trigger {
	case "bug":
		return p.startCreate(args, "Bug", rest)
	case "task":
		return p.startCreate(args, "Task", rest)
	case "ado":
		return p.handleAdoCommand(args, rest)
	default:
		return p.ephemeral("Неизвестная команда"), nil
	}
}

func (p *Plugin) handleAdoCommand(args *model.CommandArgs, rest string) (*model.CommandResponse, *model.AppError) {
	parts := strings.Fields(rest)
	sub := ""
	if len(parts) > 0 {
		sub = strings.ToLower(parts[0])
	}
	switch sub {
	case "", "help":
		return p.ephemeral("Команды Azure DevOps:\n" +
			"• `/bug [название]` — создать Bug\n" +
			"• `/task [название]` — создать Task\n" +
			"• `/ado login` — вход + выбор коллекции / проекта / команды\n" +
			"• `/ado logout` — удалить сохранённые учётные данные\n" +
			"• `/ado status` — текущее подключение"), nil
	case "login":
		_ = p.deletePending(args.UserId)
		if err := p.openAuthDialog(args, "", ""); err != nil {
			return p.ephemeral("Не удалось открыть форму входа: " + err.Error()), nil
		}
		return &model.CommandResponse{}, nil
	case "logout":
		_ = p.deletePending(args.UserId)
		if err := p.deleteConnection(args.UserId); err != nil {
			return p.ephemeral("Не удалось выйти: " + err.Error()), nil
		}
		return p.ephemeral("Учётные данные Azure DevOps удалены с этого сервера Mattermost."), nil
	case "status":
		conn, err := p.getConnection(args.UserId)
		if err != nil {
			return p.ephemeral("Ошибка чтения настроек: " + err.Error()), nil
		}
		if conn == nil {
			return p.ephemeral("Вы не авторизованы. Выполните `/ado login` или `/bug`."), nil
		}
		return p.ephemeral(fmt.Sprintf(
			"Подключено к **%s**\nКоллекция: `%s`\nПроект: `%s`\nКоманда: `%s`\nПользователь: `%s`\nМетод: NTLM",
			conn.ServerURL, conn.Collection, conn.Project, conn.Team, conn.Username,
		)), nil
	default:
		return p.ephemeral("Неизвестная подкоманда. `/ado help`"), nil
	}
}

func (p *Plugin) startCreate(args *model.CommandArgs, workItemType, titleHint string) (*model.CommandResponse, *model.AppError) {
	conn, err := p.getConnection(args.UserId)
	if err != nil {
		return p.ephemeral("Ошибка чтения учётных данных: " + err.Error()), nil
	}
	if conn == nil || strings.TrimSpace(conn.Secret) == "" || strings.TrimSpace(conn.Project) == "" {
		_ = p.deletePending(args.UserId)
		if err := p.openAuthDialog(args, workItemType, titleHint); err != nil {
			return p.ephemeral("Нужна авторизация, но диалог не открылся: " + err.Error()), nil
		}
		return &model.CommandResponse{}, nil
	}
	p.openCreateModal(args, workItemType, titleHint)
	return &model.CommandResponse{}, nil
}

func (p *Plugin) ephemeral(text string) *model.CommandResponse {
	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         text,
	}
}
