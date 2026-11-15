import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

interface WorkoutInProgressDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WorkoutInProgressDialog({ open, onClose }: WorkoutInProgressDialogProps) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} title="Workout in progress" onClose={onClose}>
      <p className="mb-4 text-body-sm text-secondary">
        Finish or discard your current workout before starting another.
      </p>
      <div className="flex flex-col gap-2">
        <Button
          fullWidth
          onClick={() => {
            onClose();
            navigate('/workout/active');
          }}
        >
          Resume workout
        </Button>
        <Button variant="secondary" fullWidth onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
