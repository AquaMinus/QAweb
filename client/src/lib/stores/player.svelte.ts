import { getSessionToken } from '../ws';

class PlayerStore {
  pin = $state<string>('');
  name = $state<string>('');
  sessionToken = $state<string>('');

  constructor() {
    this.sessionToken = getSessionToken();
  }

  setIdentity(pin: string, name: string) {
    this.pin = pin;
    this.name = name;
  }

  get isInRoom(): boolean {
    return !!this.pin && !!this.name;
  }
}

export const player = new PlayerStore();
