import React from 'react';
import { CreateModal } from './components/CreateModal';
import { LoginModal } from './components/LoginModal';
import { PLUGIN_ID } from './manifest';
import './styles.css';

type CreatePayload = {
  type?: string;
  titleHint?: string;
  channelId?: string;
  rootId?: string;
};

type LoginPayload = {
  pendingType?: string;
  pendingTitle?: string;
  channelId?: string;
  rootId?: string;
};

type Registry = {
  registerRootComponent: (component: React.ComponentType) => void;
  registerWebSocketEventHandler: (
    event: string,
    handler: (msg: { data?: CreatePayload & LoginPayload }) => void,
  ) => void;
};

type UIState =
  | { kind: 'none' }
  | {
      kind: 'create';
      type: string;
      titleHint: string;
      channelId: string;
      rootId: string;
    }
  | {
      kind: 'login';
      pendingType: string;
      pendingTitle: string;
      channelId: string;
      rootId: string;
    };

export default class Plugin {
  private setState: ((s: UIState) => void) | null = null;

  public async initialize(registry: Registry) {
    const self = this;

    class Root extends React.Component<Record<string, never>, UIState> {
      constructor(props: Record<string, never>) {
        super(props);
        this.state = { kind: 'none' };
        self.setState = (s) => this.setState(s);
      }

      render() {
        if (this.state.kind === 'login') {
          return (
            <LoginModal
              pendingType={this.state.pendingType}
              pendingTitle={this.state.pendingTitle}
              channelId={this.state.channelId}
              rootId={this.state.rootId}
              onClose={() => this.setState({ kind: 'none' })}
              onConnected={(info) => {
                if (info.pendingType) {
                  this.setState({
                    kind: 'create',
                    type: info.pendingType,
                    titleHint: info.pendingTitle,
                    channelId: info.channelId,
                    rootId: info.rootId,
                  });
                  return;
                }
                this.setState({ kind: 'none' });
              }}
            />
          );
        }
        if (this.state.kind === 'create') {
          return (
            <CreateModal
              workItemType={this.state.type}
              titleHint={this.state.titleHint}
              channelId={this.state.channelId}
              rootId={this.state.rootId}
              onClose={() => this.setState({ kind: 'none' })}
            />
          );
        }
        return null;
      }
    }

    registry.registerRootComponent(Root);

    registry.registerWebSocketEventHandler(`custom_${PLUGIN_ID}_open_login_modal`, (msg) => {
      const data = msg?.data || {};
      this.setState?.({
        kind: 'login',
        pendingType: data.pendingType || '',
        pendingTitle: data.pendingTitle || '',
        channelId: data.channelId || '',
        rootId: data.rootId || '',
      });
    });

    registry.registerWebSocketEventHandler(`custom_${PLUGIN_ID}_open_create_modal`, (msg) => {
      const data = msg?.data || {};
      this.setState?.({
        kind: 'create',
        type: data.type || 'Bug',
        titleHint: data.titleHint || '',
        channelId: data.channelId || '',
        rootId: data.rootId || '',
      });
    });
  }
}
