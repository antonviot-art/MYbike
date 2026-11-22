import { createFileRoute } from '@tanstack/react-router';
import { GaragePage } from '@/features/crew/garage';
import { pageHead } from '@/features/crew/head';
export const Route=createFileRoute('/vehicules')({head:()=>pageHead('Le garage','Les motos et quads du groupe, leurs compteurs et leurs journaux d’entretien.'),component:GaragePage});
