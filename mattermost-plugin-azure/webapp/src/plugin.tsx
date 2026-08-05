import React from 'react';
import { CreateModal } from './components/CreateModal';
import { PLUGIN_ID } from './manifest';
import './styles.css';

type OpenPayload = {
  type?: string;
  titleHint?: string;
  channelId?: string;
  rootId?: string;
};

type Registry = {
  registerRootComponent: (component: React.ComponentType) => void;
  registerWebSocketEventHandler: (
    event: string,
    handler: (msg: { data?: OpenPayload }) => void,
  ) => void;
};

type ModalState = OpenPayload & { open: boolean };

export default class Plugin {
  private setState: ((s: ModalState) => void) | null = null;

  public async initialize(registry: Registry) {
    const self = this;

    class Root extends React.Component<Record<string, never>, ModalState> {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { open: false };
        self.setState = (s) => this.setState(s);
      }

      render() {
        if (!this.state.open) return null;
        return (
          <CreateModal
            workItemType={this.state.type || 'Bug'}
            titleHint={this.state.titleHint || ''}
            channelId={this.state.channelId || ''}
            rootId={this.state.rootId || ''}
            onClose={() => this.setState({ open: false })}
          />
        );
      }
    }

    registry.registerRootComponent(Root);

    // Mattermost prefixes plugin WS events as custom_<pluginid>_<event>
    const eventName = `custom_${PLUGIN_ID}_open_create_modal`;
    registry.registerWebSocketEventHandler(eventName, (msg) => {
      const data = msg?.data || {};
      this.setState?.({
        open: true,
        type: data.type || 'Bug',
        titleHint: data.titleHint || '',
        channelId: data.channelId || '',
        rootId: data.rootId || '',
      });
    });
  }
}
