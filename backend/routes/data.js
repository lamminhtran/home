const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');

// @route   GET api/data
// @desc    Get all data (budget + expenses) for user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({ user: req.user.id });
    const expenses = await Expense.find({ user: req.user.id }).sort({ date: -1 });

    if (!budget) {
        // Fallback if somehow budget doesn't exist
        return res.json({
            totalBudget: 700000000,
            categoryLimits: {
                construction: 300000000,
                interior: 200000000,
                garden: 100000000,
                other: 100000000
            },
            expenses
        });
    }

    res.json({
      totalBudget: budget.totalBudget,
      categoryLimits: budget.categoryLimits,
      expenses: expenses.map(e => ({
        id: e._id, // map _id to id for frontend compatibility
        category: e.category,
        desc: e.desc,
        amount: e.amount,
        date: e.date,
        notes: e.notes
      }))
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/data/budget
// @desc    Update budget settings
// @access  Private
router.put('/budget', auth, async (req, res) => {
    const { totalBudget, categoryLimits } = req.body;
    try {
        let budget = await Budget.findOne({ user: req.user.id });
        if (!budget) {
            budget = new Budget({ user: req.user.id });
        }
        
        budget.totalBudget = totalBudget;
        budget.categoryLimits = categoryLimits;
        
        await budget.save();
        res.json(budget);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/data/expenses
// @desc    Add new expense
// @access  Private
router.post('/expenses', auth, async (req, res) => {
    const { category, desc, amount, date, notes } = req.body;
    try {
        const newExpense = new Expense({
            user: req.user.id,
            category,
            desc,
            amount,
            date,
            notes
        });

        const saved = await newExpense.save();
        res.json({
            id: saved._id,
            category: saved.category,
            desc: saved.desc,
            amount: saved.amount,
            date: saved.date,
            notes: saved.notes
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT api/data/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/expenses/:id', auth, async (req, res) => {
    const { category, desc, amount, date, notes } = req.body;
    try {
        let expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });
        
        // Ensure user owns expense
        if (expense.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        expense.category = category;
        expense.desc = desc;
        expense.amount = amount;
        expense.date = date;
        expense.notes = notes;

        await expense.save();
        res.json({
            id: expense._id,
            category, desc, amount, date, notes
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE api/data/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/expenses/:id', auth, async (req, res) => {
    try {
        let expense = await Expense.findById(req.params.id);
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });

        if (expense.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Expense.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Expense removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
