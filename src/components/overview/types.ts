export type SgCall = {
  id?: string;
  status?: string;
  providerId?: string | number;
  caller?: string;
  amount?: string;
  createdAt?: string;
};

export type SgProvider = {
  id: string;
  active?: boolean;
  completedCalls: string;
  slashedCalls: string;
  pricePerCall?: string;
  stake?: string;
};

export type SgMeta = {
  block?: { number?: number; timestamp?: number | null };
  hasIndexingErrors?: boolean;
  deployment?: string;
};
