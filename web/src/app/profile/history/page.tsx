// History was renamed to /memory ("Memory lane"). Old links bounce.

import { redirect } from 'next/navigation';

export default function HistoryPage() {
  redirect('/memory');
}
