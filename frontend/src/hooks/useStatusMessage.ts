import { useState } from "react";

type StatusType = "success" | "error" | "info";

interface UseStatusMessageResult {
  statusMessage: string;
  statusType: StatusType;
  showStatus: (message: string, type: StatusType) => void;
  clearStatus: () => void;
}

export function useStatusMessage(): UseStatusMessageResult {
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("info");

  const showStatus = (message: string, type: StatusType) => {
    setStatusMessage(message);
    setStatusType(type);
    setTimeout(() => setStatusMessage(""), 4000);
  };

  const clearStatus = () => {
    setStatusMessage("");
  };

  return {
    statusMessage,
    statusType,
    showStatus,
    clearStatus,
  };
}
