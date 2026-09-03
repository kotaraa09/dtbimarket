'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MeResponse } from '@dtbi/shared';
import { api, ApiRequestError } from './api';

type State =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'signed-in'; me: MeResponse };

/**
 * Who is signed in, and do they have a store yet.
 *
 * The session cookie is httpOnly, so the browser cannot read it — asking the
 * API is the only way to know. That is deliberate (ADR-0003): a cookie that
 * JavaScript can read is a cookie an injected script can steal.
 */
export function useMe() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/auth/me');
      setState({ status: 'signed-in', me });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setState({ status: 'anonymous' });
      } else {
        setState({ status: 'anonymous' });
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { state, reload };
}
