import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ChakraProvider } from "@chakra-ui/react";
import App from "./App";
import { StoreProvider } from "./mock/store";
import { theme } from "./theme";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ChakraProvider theme={theme}>
      <BrowserRouter>
        <StoreProvider>
          <App />
        </StoreProvider>
      </BrowserRouter>
    </ChakraProvider>
  </StrictMode>,
);
