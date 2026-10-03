import { createContext } from 'react';
import type { SafetyReportSummary } from '@/features/safety-report/read';

export const TestimonyContext = createContext<SafetyReportSummary | null>(null);
