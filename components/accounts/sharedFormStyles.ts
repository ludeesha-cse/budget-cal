import { StyleSheet } from 'react-native';

export const sharedFormStyles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  error: {
    marginTop: 12,
  },
  modalCurrent: {
    fontSize: 14,
    marginBottom: 4,
  },
  payOffDateRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  dueDateButton: {
    flex: 1,
  },
});
