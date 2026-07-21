import { registerRootComponent } from "expo";
import App from "./App";
import { registerBackgroundSync } from "./src/background";

registerBackgroundSync();
registerRootComponent(App);
