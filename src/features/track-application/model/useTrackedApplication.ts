import { useContext } from 'react';
import { TrackerContext } from './TrackerContext';

export function useTrackedApplication() {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error('useTrackedApplication нужно вызывать внутри <ApplicationTrackerProvider>');
  return ctx;
}
