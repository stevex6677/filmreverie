import type { Dispatch, ReactNode } from 'react';
import type { ViewerAction, ViewerState } from '../state/viewerState';
import { MobileControls, type MobileSheet } from './MobileControls';

// Both room layouts share the same header and lighting panel.
export function Controls(props: {
  state: ViewerState;
  dispatch: Dispatch<ViewerAction>;
  onOpenLibrary: () => void;
  onOpenRoom: () => void;
  onOpenTable: () => void;
  onOpenCameras?: () => void;
  sheet: MobileSheet;
  setSheet: (sheet: MobileSheet) => void;
  emptyRollMessage?: string;
  ownerActions?: ReactNode;
  createAction?: ReactNode;
}) {
  return <div className="desktop-room-controls" data-testid="controls-panel">
    <MobileControls {...props} roomNavigation />
  </div>;
}
