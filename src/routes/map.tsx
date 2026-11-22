import { createFileRoute } from '@tanstack/react-router';
import { MapPage } from '@/features/crew/map-page';
import { pageHead } from '@/features/crew/head';
export const Route=createFileRoute('/map')({head:()=>pageHead('Les chemins','Préparez vos parcours moto et quad, importez vos traces GPX et partagez vos repères.'),component:MapPage});
