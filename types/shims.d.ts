// Ambient declarations for third-party modules that don't ship their own types.

declare module "os-utils" {
  export function cpuUsage(callback: (v: number) => void): void;
  export function platform(): string;
  export function cpuCount(): number;
  export function sysUptime(): number;
  export function processUptime(): number;
  export function freemem(): number;
  export function totalmem(): number;
  export function freememPercentage(): number;
  export function freeCommand(callback: (used: number) => void): void;
  export function harddrive(
    callback: (total: number, free: number, used: number) => void,
  ): void;
  export function getProcesses(callback: (result: string) => void): void;
  export function allLoadavg(): string;
  export function loadavg(_time?: number): number;
}

declare module "input" {
  interface Input {
    text(prompt: string): Promise<string>;
    confirm(prompt: string): Promise<boolean>;
    select(prompt: string, choices: string[]): Promise<string>;
  }
  const input: Input;
  export default input;
}
