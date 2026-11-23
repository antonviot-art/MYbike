import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrew } from './context';
import { socialCall } from './social';

export function ProfileFriendAction({ pilotId, viewerId }: { pilotId: string; viewerId: string }) {
  const { refresh } = useCrew();
  const client = useQueryClient();
  const queryKey = ['mybike-friendships', viewerId];
  const { data, isPending, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => socialCall('mybike_friends_list', {}),
    refetchInterval: 20000,
  });
  const status = data?.find(friend => friend.user_id === pilotId)?.status;
  const action = useMutation({
    mutationFn: (accept: boolean) => socialCall(accept ? 'mybike_friend_accept' : 'mybike_friend_request', { friend_id: pilotId }),
    onSuccess: async (_, accept) => {
      await client.invalidateQueries({ queryKey });
      if (accept) void refresh().catch(() => {});
      toast.success(accept ? 'Demande acceptée.' : 'Demande d’ami envoyée.');
    },
    onError: error => toast.error(error.message || 'Impossible de traiter la demande.'),
  });

  if (status === 'accepted') return <span className="flex items-center gap-2 text-sm text-success"><Check size={16} aria-hidden="true" /> Amis</span>;
  if (status === 'outgoing') return <span className="flex items-center gap-2 text-sm text-muted-foreground"><Clock size={16} aria-hidden="true" /> Demande envoyée</span>;
  if (isError && !data) return <Button size="sm" variant="outline" onClick={() => void refetch()}>Réessayer de charger le statut</Button>;
  return <Button disabled={isPending || action.isPending} onClick={() => action.mutate(status === 'incoming')}>
    <UserPlus /> {isPending ? 'Chargement…' : status === 'incoming' ? 'Accepter sa demande' : 'Ajouter en ami'}
  </Button>;
}
