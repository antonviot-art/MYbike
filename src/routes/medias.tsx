import { createFileRoute } from '@tanstack/react-router';
import { MediaPage } from '@/features/crew/media';
import { pageHead } from '@/features/crew/head';
export const Route=createFileRoute('/medias')({head:()=>pageHead('Les souvenirs','Les photos et vidéos des sorties moto et quad du groupe.'),component:MediaPage});
