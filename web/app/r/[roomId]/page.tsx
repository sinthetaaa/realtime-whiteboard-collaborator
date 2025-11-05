'use client';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const Whiteboard = dynamic(() => import('../../../components/Whiteboard'), { ssr: false });

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  return <Whiteboard roomId={roomId} />;
}

