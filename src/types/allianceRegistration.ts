export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface AllianceRegistration {
  id: string;
  ticketCode: string;
  airlineName: string;
  applicantId: string;
  status: RegistrationStatus;
  adminNote?: string;
  createdAt: any;
  updatedAt: any;
}
