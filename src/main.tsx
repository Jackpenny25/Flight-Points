
  import { createRoot } from "react-dom/client";
  import App from "./app/App";
  import "./styles/index.css";
  import { LOCAL_MODE } from "../utils/config";
  
  // Enable local-only storage mode by intercepting API calls
  if (LOCAL_MODE) {
    import("./utils/localApiShim").then(m => m.enableLocalMode()).catch(() => {});
  }

  createRoot(document.getElementById("root")!).render(<App />);
  