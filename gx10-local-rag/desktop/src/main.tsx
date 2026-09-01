import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'

// StrictMode double-mount breaks 3d-force-graph in Electron; keep a single mount.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
