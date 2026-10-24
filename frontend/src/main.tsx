import { Amplify } from "aws-amplify";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setApiUrl } from "./api";
import { App } from "./App";
import { loadConfig } from "./config";
import { registerServiceWorker } from "./push";
import "./styles.css";

registerServiceWorker();

const root = createRoot(document.getElementById("root")!);

loadConfig()
  .then((config) => {
    Amplify.configure({
      Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId } },
    });
    setApiUrl(config.apiUrl);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e: Error) => {
    root.render(<p className="page error">{e.message}</p>);
  });
