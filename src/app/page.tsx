import { redirect } from 'next/navigation';

// La landing y los paneles se sirven como assets Claude Design desde /public/dc.
// La raíz redirige a la home corporativa.
export default function Home() {
  redirect('/dc/Aplika.ai.dc.html');
}
