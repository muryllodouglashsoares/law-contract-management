import { useCallback, useEffect, useState } from 'react';

import { toErrorMessage } from './useApiQuery';
import {
  PushPermissionDeniedError,
  disablePush,
  enablePush,
  getPermission,
  isEnabledForUser,
  isPushSupported,
} from '../lib/push-client';
import { pushService } from '../services/push';

export type PushUiState =
  | 'loading'
  | 'unsupported' // navegador sem Push API
  | 'unconfigured' // servidor sem VAPID
  | 'blocked' // usuário bloqueou no navegador
  | 'enabled' // ativo neste dispositivo
  | 'disabled';

export function usePushNotifications(userId: string | undefined) {
  const [state, setState] = useState<PushUiState>('loading');
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }
    try {
      const status = await pushService.status();
      setPublicKey(status.publicKey);
      if (!status.configured || !status.publicKey) {
        setState('unconfigured');
      } else if (getPermission() === 'denied') {
        setState('blocked');
      } else {
        setState((await isEnabledForUser(userId)) ? 'enabled' : 'disabled');
      }
    } catch (err) {
      setState('disabled');
      setMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível carregar o estado das notificações.') });
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const enable = useCallback(async () => {
    if (!userId || !publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      await enablePush(userId, publicKey);
      setState('enabled');
      setMessage({ type: 'success', text: 'Notificações ativadas neste dispositivo.' });
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        // "Fechar o diálogo" mantém 'default' (pode tentar de novo); "Bloquear" vira 'denied'.
        setState(getPermission() === 'denied' ? 'blocked' : 'disabled');
      } else {
        setMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível ativar as notificações.') });
      }
    } finally {
      setBusy(false);
    }
  }, [userId, publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disablePush();
      setState('disabled');
      setMessage({ type: 'success', text: 'Notificações desativadas neste dispositivo.' });
    } catch (err) {
      setMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível desativar as notificações.') });
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { sent } = await pushService.test();
      setMessage(
        sent > 0
          ? { type: 'success', text: 'Aviso de teste enviado. Ele deve aparecer em instantes.' }
          : { type: 'error', text: 'Nenhum dispositivo ativo foi encontrado. Desative e ative novamente.' },
      );
    } catch (err) {
      setMessage({ type: 'error', text: toErrorMessage(err, 'Não foi possível enviar o teste.') });
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, message, enable, disable, sendTest };
}
