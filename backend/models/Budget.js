const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  totalBudget: {
    type: Number,
    default: 700000000
  },
  categoryLimits: {
    construction: { type: Number, default: 300000000 },
    interior: { type: Number, default: 200000000 },
    garden: { type: Number, default: 100000000 },
    other: { type: Number, default: 100000000 }
  }
});

module.exports = mongoose.model('Budget', BudgetSchema);
