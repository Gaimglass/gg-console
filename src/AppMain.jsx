import GaimglassApp from './GaimglassApp';
import { SettingsProvider } from './SettingsProvider';
import { ControllerProvider } from './ControllerProvider';

export default function AppMain() {
  return (
    <SettingsProvider>
      <ControllerProvider>
        <GaimglassApp />
      </ControllerProvider> 
    </SettingsProvider>
  );
}
