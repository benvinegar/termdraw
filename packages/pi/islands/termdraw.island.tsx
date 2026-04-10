/** @jsxImportSource @opentui/react */

import { TermDrawApp } from "@benvinegar/termdraw";

type PiTermDrawIslandProps = {
  showStartupLogo?: boolean;
};

export default function PiTermDrawIsland({ showStartupLogo = false }: PiTermDrawIslandProps) {
  return (
    <TermDrawApp
      width="100%"
      height="100%"
      autoFocus
      showStartupLogo={showStartupLogo}
      cancelOnCtrlC={false}
    />
  );
}
