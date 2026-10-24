import classNames from 'classnames';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import UpdatesTabWrapper from './UpdatesTabWrapper.rsx';
import Updates from './Updates';
import ADS from './ADS';
import Ambient from './Ambient';
import KeyBindings from './KeyBindings';
import OverlaySettings from './OverlaySettings';
import styles from './css/GaimglassPanel.module.css';

export default function GaimglassPanel({
  fullscreen, connected, selectedTab, onSelectTab, onCalibrateSelect, updates, calibratePanel,
}) {
  const tabs = [
    { name: 'Calibrate', content: calibratePanel },
    { name: 'ADS', content: connected && <ADS /> },
    { name: 'Ambient', content: connected && <Ambient /> },
    ...(!fullscreen ? [
      { name: 'Shortcuts', content: <KeyBindings /> },
      { name: 'Overlay', content: <OverlaySettings /> },
      { name: 'Updates', content: <Updates updates={updates} /> },
    ] : []),
  ];
  const activeTab = !connected && tabs[selectedTab]?.name !== 'Updates' ? 0 : selectedTab;
  const tabList = <TabList className={styles.tabControls}>
    {tabs.map(({ name }, index) => {
      const disabled = !connected && name !== 'Calibrate' && name !== 'Updates';
      return <Tab key={name} tabIndex="-1" disabled={disabled}>
        <button disabled={disabled} onClick={index === 0 && connected && !fullscreen ? onCalibrateSelect : undefined}>{name}</button>
      </Tab>;
    })}
  </TabList>;

  return (
    <section aria-label="Gaimglass controls" className={classNames(styles.panel, { [styles.fullscreen]: fullscreen })}>
      <Tabs className={styles.tabs} selectedIndex={activeTab} onSelect={onSelectTab}>
        {fullscreen ? tabList : <UpdatesTabWrapper updates={updates}>
          {tabList}
        </UpdatesTabWrapper>}
        {tabs.map(({ name, content }, index) => <TabPanel
          key={name}
          className={styles.tabPanel}
          selectedClassName={styles.selectedPanel}
          forceRender={index < 3}
        >{content}</TabPanel>)}
      </Tabs>
    </section>
  );
}
