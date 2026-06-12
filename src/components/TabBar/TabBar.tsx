import { Component, For, Show } from "solid-js";
import { appStore } from "../../stores/app";
import "./TabBar.css";

const TabBar: Component = () => {
  return (
    <div class="tab-bar">
      <For each={appStore.tabs()}>
        {(tab) => (
          <div
            class="tab"
            classList={{ active: tab.id === appStore.activeTabId() }}
            onClick={() => appStore.setActiveTabId(tab.id)}
          >
            <span class="tab-name">{tab.name}</span>
            <button
              class="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                appStore.closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default TabBar;
