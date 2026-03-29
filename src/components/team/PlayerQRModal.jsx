import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function PlayerQRModal({ team, open, onClose }) {
  const [playerIdx, setPlayerIdx] = useState(0);

  if (!team) return null;

  const roster = team.roster || [];
  const player = roster[playerIdx];

  const qrData = JSON.stringify({
    team_id: team.id,
    team_name: team.name,
    tournament_id: team.tournament_id,
    player_email: player?.player_email,
    player_name: player?.player_name,
    game_id: player?.game_id,
    checkin: true,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-sm tracking-wider">Digital Player ID — {team.name}</DialogTitle>
        </DialogHeader>

        {roster.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No roster players found</div>
        ) : (
          <div className="space-y-4">
            {/* Player nav */}
            <div className="flex items-center justify-between">
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={playerIdx === 0} onClick={() => setPlayerIdx(i => i - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground">{playerIdx + 1} / {roster.length}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8" disabled={playerIdx === roster.length - 1} onClick={() => setPlayerIdx(i => i + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* QR + info */}
            <AnimatePresence mode="wait">
              <motion.div
                key={playerIdx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="bg-white p-4 rounded-2xl">
                  <QRCodeSVG value={qrData} size={180} level="H" />
                </div>
                <div className="text-center">
                  <p className="font-display font-bold text-foreground">{player?.player_name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{player?.player_email}</p>
                  {player?.game_id && <p className="text-xs text-primary mt-1">Game ID: {player.game_id}</p>}
                  {player?.role && <p className="text-xs bg-secondary px-2 py-0.5 rounded mt-1 inline-block capitalize">{player.role}</p>}
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  <p>Team: <span className="text-foreground font-medium">{team.name}</span> [{team.tag}]</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}