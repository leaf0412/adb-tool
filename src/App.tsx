import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DevicesPage from "./pages/DevicesPage";
import InstallPage from "./pages/InstallPage";
import AppsPage from "./pages/AppsPage";
import LogcatPage from "./pages/LogcatPage";
import FilesPage from "./pages/FilesPage";
import OpLogPage from "./pages/OpLogPage";
import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DevicesPage />} />
          <Route path="/install" element={<InstallPage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/logcat" element={<LogcatPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/oplog" element={<OpLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
