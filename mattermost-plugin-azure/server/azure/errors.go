package azure

import (
	"fmt"
	"strings"
)

// FormatConnectError turns low-level dial/DNS errors into actionable Russian messages.
// The plugin runs on the Mattermost server — DNS must work there, not only on the user's PC.
func FormatConnectError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "no such host"),
		strings.Contains(lower, "server misbehaving"),
		strings.Contains(lower, "temporary failure in name resolution"):
		return fmt.Sprintf(
			"%s\n\nСервер Mattermost не может разрешить имя хоста Azure DevOps (DNS). "+
				"Плагин ходит в TFS **с машины Mattermost**, не с вашего ПК. "+
				"На сервере MM проверьте: `ping`/`nslookup` хоста, корпоративный DNS или запись в `/etc/hosts`, "+
				"либо укажите IP в URL (если сертификат позволяет).",
			msg,
		)
	case strings.Contains(lower, "connection refused"),
		strings.Contains(lower, "i/o timeout"),
		strings.Contains(lower, "network is unreachable"),
		strings.Contains(lower, "no route to host"):
		return fmt.Sprintf(
			"%s\n\nСервер Mattermost не достучался до Azure DevOps по сети. "+
				"Проверьте firewall/маршрутизацию с хоста MM до TFS.",
			msg,
		)
	case strings.Contains(lower, "x509"),
		strings.Contains(lower, "certificate"),
		strings.Contains(lower, "tls"):
		return fmt.Sprintf(
			"%s\n\nПроблема с TLS-сертификатом. Включите «Небезопасный TLS» в форме входа "+
				"или установите корпоративный CA на сервере Mattermost.",
			msg,
		)
	default:
		return msg
	}
}
