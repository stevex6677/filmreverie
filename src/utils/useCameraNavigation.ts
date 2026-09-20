import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { ViewerAction, ViewerState } from '../state/viewerState';
import { cameraById } from '../data/cameras';

// Store only navigation, never photo data or GPU resources, in browser history.
export function useCameraNavigation(state: ViewerState, dispatch: Dispatch<ViewerAction>) {
  const previous = useRef(''), restoring = useRef(false);
  const view = state.cameraDisplay ? `camera:${state.cameraDisplay}` : state.shelfId ?? state.roomMode;
  useEffect(() => {
    if (restoring.current) restoring.current = false;
    else if (previous.current && previous.current !== view) history.pushState({ ...history.state, darkroomView: view }, '');
    else if (!previous.current) history.replaceState({ ...history.state, darkroomView: view }, '');
    previous.current = view;
  }, [view]);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const next = event.state?.darkroomView;
      if (typeof next !== 'string' || next === previous.current) return;
      restoring.current = true;
      if (next.startsWith('camera:') && cameraById(next.slice(7))) {
        dispatch({ type: 'APPROACH_CAMERA_SHELF' }); dispatch({ type: 'OPEN_CAMERA', id: next.slice(7) });
      } else if (next === 'camera') { dispatch({ type: 'APPROACH_CAMERA_SHELF' }); dispatch({ type: 'CLOSE_CAMERA' }); }
      else if (next === 'film') dispatch({ type: 'APPROACH_SHELF' });
      else { dispatch({ type: 'SET_ROOM_MODE', mode: next === 'inspect' ? 'inspect' : 'room' }); dispatch({ type: 'SET_TRANSITIONING', isTransitioning: true }); }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [dispatch]);
}
