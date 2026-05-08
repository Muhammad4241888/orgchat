import axios from 'axios';
axios.defaults.baseURL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);