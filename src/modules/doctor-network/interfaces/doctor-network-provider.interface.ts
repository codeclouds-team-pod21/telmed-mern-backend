export interface DoctorNetworkProvider {
  readonly type: string;
  getDoctorNetworkOffers(network: {
    id?: number;
    apiUrl: string;
    apiVersion?: string | null;
    credentials: string;
  }): Promise<unknown>;
  refreshToken?(
    network: {
      id?: number;
      apiUrl: string;
      apiVersion?: string | null;
      credentials: string;
    },
    persist?: boolean,
  ): Promise<string>;
}
