import { NOTIFICATIONS_CHANGED_EVENT, notifyNotificationsChanged, onNotificationsChanged } from './notifications-events';

describe('evento de sincronização de notificações', () => {
  it('usa o nome notifications:changed', () => {
    expect(NOTIFICATIONS_CHANGED_EVENT).toBe('notifications:changed');
  });

  it('notify dispara o ouvinte registrado; o cleanup o remove', () => {
    const target = new EventTarget();
    let calls = 0;
    const off = onNotificationsChanged(() => (calls += 1), target);

    notifyNotificationsChanged(target);
    notifyNotificationsChanged(target);
    expect(calls).toBe(2);

    off();
    notifyNotificationsChanged(target);
    expect(calls).toBe(2);
  });
});
