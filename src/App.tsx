// src/App.tsx
import React from 'react';
import './App.css';
import WalletConnect from './components/WalletConnect';

function App() {
  return (
    <div className="App">
          <h1 style={{
        textAlign: 'center',
        padding: '2rem 0',
        color: '#6B46C1', 
        fontSize: '2.5rem',
        fontWeight: '700',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        marginBottom: '2rem',
        borderBottom: '2px solid #E2E8F0',
        background: 'linear-gradient(to right, #6B46C1, #805AD5)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        Algorand Pera Ecosystem Challenge
      </h1>
      <WalletConnect />
    </div>
  );
}

export default App;