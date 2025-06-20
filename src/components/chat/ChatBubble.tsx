
import type { Message } from '@/app/page'; 
import { cn } from "@/lib/utils";
import { User, Bot } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ChatBubbleProps {
  message: Message;
  avatarSrc: string; 
  textAnimationEnabled: boolean;
  textAnimationSpeedMs: number;
  textPopulationStaggerMs: number; // New prop
  isNewlyAddedAiMessage: boolean;
}

export default function ChatBubble({ 
  message, 
  avatarSrc,
  textAnimationEnabled,
  textAnimationSpeedMs,
  textPopulationStaggerMs, // New prop
  isNewlyAddedAiMessage
}: ChatBubbleProps) {
  const isUser = message.sender === 'user';
  const DEFAULT_AVATAR_PLACEHOLDER = "https://placehold.co/40x40.png"; 

  const renderTextContent = () => {
    if (message.sender === 'ai' && textAnimationEnabled && isNewlyAddedAiMessage) {
      const letters = message.text.split('');
      const animationDuration = textAnimationSpeedMs > 0 ? textAnimationSpeedMs : 800; 
      // Use the new prop for stagger, ensuring a minimum reasonable delay
      const staggerDelay = textPopulationStaggerMs > 0 ? textPopulationStaggerMs : 50;

      return letters.map((letter, index) => (
        <span
          key={`${message.id}-letter-${index}`}
          className="scale-in-letter"
          style={{
            animationDuration: `${animationDuration}ms`,
            animationDelay: `${index * staggerDelay}ms`, // Use new stagger prop
          }}
        >
          {letter === ' ' ? '\u00A0' : letter} 
        </span>
      ));
    }
    return <p className="text-sm whitespace-pre-wrap">{message.text}</p>;
  };

  return (
    <div className={cn("flex mb-4 items-end animate-in fade-in duration-300", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <Avatar className="h-8 w-8 mr-2 self-start">
          {avatarSrc && !avatarSrc.startsWith('https://placehold.co') ? (
             <AvatarImage src={avatarSrc} alt="AI Avatar" className="object-cover"/>
          ) : (
             <AvatarImage src={DEFAULT_AVATAR_PLACEHOLDER} alt="AI Avatar Placeholder" data-ai-hint="professional woman" />
          )}
          <AvatarFallback><Bot size={20}/></AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg shadow",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-secondary text-secondary-foreground rounded-bl-none"
        )}
      >
        {renderTextContent()}
        <p className={cn("text-xs mt-1", isUser ? "text-primary-foreground/70 text-right" : "text-muted-foreground text-left")}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
         <Avatar className="h-8 w-8 ml-2 self-start">
          <AvatarFallback><User size={20}/></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
