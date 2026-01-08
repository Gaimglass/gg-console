import React, { createContext, useContext, useState } from 'react';

const ControllerContext = createContext();

export function ControllerProvider({ children }) {
  const [type, setType] = useState(null);
  const value = {
    type,
    setType
  };
  return (
    <ControllerContext.Provider value={value}>
      {children}
    </ControllerContext.Provider>
  );
}

export function useController() {
  const context = useContext(ControllerContext);
  if (!context) {
    throw new Error('useController must be used within a Controller Provider');
  }
  return context;
}
